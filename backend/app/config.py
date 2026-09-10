from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./civicflow.db"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # auto: use Bedrock when AWS credentials are present, otherwise the built-in offline policy model.
    model_provider: Literal["auto", "bedrock", "local"] = "auto"
    bedrock_model_id: str = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
    aws_region: str = "us-east-1"

    # Background monitor cadence (seconds). 0 disables the loop (tests).
    monitor_interval_seconds: int = 60
    seed_demo_data: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
