from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    result_ttl_seconds: int = 60 * 60 * 24
    max_upload_mb: int = 200
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str | None = r"^http://(localhost|127\.0\.0\.1):[0-9]+$"
    hf_token: str | None = None
    hf_text_model: str = "desklib/ai-text-detector-v1.01"
    hf_text_fallback_models: str = "Oxidane/tmr-ai-text-detector"
    hf_image_model: str = "haywoodsloan/ai-image-detector-dev-deploy"
    hf_image_fallback_models: str = "Ateeqq/ai-vs-human-image-detector,umm-maybe/AI-image-detector"
    hf_video_frame_model: str = "haywoodsloan/ai-image-detector-dev-deploy"
    hf_inference_endpoint_base: str = "https://router.huggingface.co/hf-inference/models"

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

    @property
    def hf_text_model_list(self) -> list[str]:
        return [self.hf_text_model, *[model.strip() for model in self.hf_text_fallback_models.split(",") if model.strip()]]

    @property
    def hf_image_model_list(self) -> list[str]:
        return [self.hf_image_model, *[model.strip() for model in self.hf_image_fallback_models.split(",") if model.strip()]]


@lru_cache
def get_settings() -> Settings:
    return Settings()
