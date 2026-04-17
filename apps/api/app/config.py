from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    result_ttl_seconds: int = 60 * 60 * 24
    max_upload_mb: int = 200
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str | None = r"^http://(localhost|127\.0\.0\.1):[0-9]+$"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="TRUTHLENS_",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
