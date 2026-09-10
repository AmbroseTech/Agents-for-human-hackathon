import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent import orchestrator
from app.api.routes import router
from app.config import get_settings
from app.db import models  # noqa: F401 - register models with Base
from app.db.session import Base, engine, session_scope
from app.services import seed
from app.services.monitor import monitor_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("civicflow")


def init_db(with_demo: bool) -> None:
    Base.metadata.create_all(bind=engine)
    with session_scope() as db:
        seed.seed_organization(db)
        if with_demo:
            n = seed.seed_history(db, orchestrator.process_request)
            if n:
                log.info("Seeded %d demo requests", n)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    init_db(cfg.seed_demo_data)
    log.info("CivicFlow agent: %s", orchestrator.model_info())
    stop = asyncio.Event()
    task = asyncio.create_task(monitor_loop(cfg.monitor_interval_seconds, stop))
    try:
        yield
    finally:
        stop.set()
        await task


app = FastAPI(
    title="CivicFlow AI",
    version="0.1.0",
    description="Autonomous community operations agent built on Strands Agents SDK.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
