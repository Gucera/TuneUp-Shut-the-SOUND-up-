import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")



class BackendConfigurationError(RuntimeError):
    """Raised when backend environment configuration is missing or invalid."""


@dataclass(frozen=True)
class BackendSettings:
    app_env: str
    supabase_url: str
    supabase_key: str
    supabase_audio_bucket: str
    supabase_audio_prefix: str
    cors_allow_origins: list[str]
    analysis_job_timeout_seconds: int = 900
    log_level: str = "INFO"


REQUIRED_ENV_VARS = (
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_AUDIO_BUCKET",
    "SUPABASE_AUDIO_PREFIX",
    "CORS_ALLOW_ORIGINS",
)

VALID_LOG_LEVELS = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "NOTSET"}
DEFAULT_ANALYSIS_JOB_TIMEOUT_SECONDS = 900
APP_ENV_NAMES = ("APP_ENV", "ENV", "NODE_ENV", "PYTHON_ENV")


def _is_missing(value: str | None) -> bool:
    return value is None or value.strip() == ""


def _has_surrounding_quotes(value: str) -> bool:
    return len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}


def _format_errors(errors: list[str]) -> BackendConfigurationError:
    return BackendConfigurationError(
        "Backend configuration error:\n" + "\n".join(f"- {error}" for error in errors)
    )


def _validate_supabase_url(value: str, errors: list[str]) -> str:
    lowercase_value = value.lower()
    if "your-project" in lowercase_value or "your_project" in lowercase_value:
        errors.append(
            "Invalid SUPABASE_URL. Expected a real Supabase project URL like "
            "https://your-project.supabase.co"
        )
        return value

    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or ".supabase.co" not in parsed.netloc:
        errors.append(
            "Invalid SUPABASE_URL. Expected a real Supabase project URL like "
            "https://your-project.supabase.co"
        )

    return value


def _validate_storage_value(name: str, value: str, errors: list[str]) -> str:
    if value != value.strip():
        errors.append(f"{name} must not contain leading or trailing spaces.")

    if _has_surrounding_quotes(value):
        errors.append(f"{name} must not contain surrounding quotes.")

    return value


def _parse_cors_origins(value: str, errors: list[str]) -> list[str]:
    if "CORS_ALLOW_ORIGINS=" in value:
        errors.append(
            "Invalid CORS_ALLOW_ORIGINS. Use comma-separated origins, for example: "
            "CORS_ALLOW_ORIGINS=http://localhost:8081,http://localhost:19006"
        )
        return []

    raw_parts = value.split(",")
    parts = [origin.strip() for origin in raw_parts]

    if any(origin == "" for origin in parts):
        errors.append(
            "Invalid CORS_ALLOW_ORIGINS. Use comma-separated origins, for example: "
            "CORS_ALLOW_ORIGINS=http://localhost:8081,http://localhost:19006"
        )
        return []

    if "*" in parts and len(parts) > 1:
        errors.append("Invalid CORS_ALLOW_ORIGINS. Use '*' by itself or list explicit origins.")

    for origin in parts:
        if origin == "*":
            continue

        parsed = urlparse(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path not in {"", "/"}
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            errors.append(
                "Invalid CORS_ALLOW_ORIGINS. Origins must be comma-separated http(s) origins "
                "without paths, for example: CORS_ALLOW_ORIGINS=http://localhost:8081,http://localhost:19006"
            )
            break

    return parts


def _resolve_app_env(source: Mapping[str, str]) -> str:
    for name in APP_ENV_NAMES:
        value = source.get(name)
        if not _is_missing(value):
            return str(value).strip().lower()

    return "development"


def _is_production_env(app_env: str) -> bool:
    return app_env == "production"


def _parse_positive_int(name: str, value: str | None, default: int, errors: list[str]) -> int:
    if _is_missing(value):
        return default

    try:
        parsed_value = int(str(value).strip())
    except ValueError:
        errors.append(f"{name} must be a positive integer.")
        return default

    if parsed_value <= 0:
        errors.append(f"{name} must be a positive integer.")

    return parsed_value


def load_settings(environ: Mapping[str, str] | None = None) -> BackendSettings:
    source = os.environ if environ is None else environ
    errors: list[str] = []

    for name in REQUIRED_ENV_VARS:
        if _is_missing(source.get(name)):
            errors.append(f"Missing required environment variable: {name}")

    if errors:
        raise _format_errors(errors)

    app_env = _resolve_app_env(source)
    supabase_url = _validate_supabase_url(source["SUPABASE_URL"].strip(), errors)
    supabase_key = source["SUPABASE_KEY"].strip()
    supabase_audio_bucket = _validate_storage_value(
        "SUPABASE_AUDIO_BUCKET", source["SUPABASE_AUDIO_BUCKET"], errors
    )
    supabase_audio_prefix = _validate_storage_value(
        "SUPABASE_AUDIO_PREFIX", source["SUPABASE_AUDIO_PREFIX"], errors
    )
    cors_allow_origins = _parse_cors_origins(source["CORS_ALLOW_ORIGINS"], errors)
    analysis_job_timeout_seconds = _parse_positive_int(
        "ANALYSIS_JOB_TIMEOUT_SECONDS",
        source.get("ANALYSIS_JOB_TIMEOUT_SECONDS"),
        DEFAULT_ANALYSIS_JOB_TIMEOUT_SECONDS,
        errors,
    )
    log_level = source.get("LOG_LEVEL", "INFO").strip().upper() or "INFO"

    if log_level not in VALID_LOG_LEVELS:
        valid_levels = ", ".join(sorted(VALID_LOG_LEVELS))
        errors.append(f"Invalid LOG_LEVEL '{log_level}'. Expected one of: {valid_levels}")

    if _is_production_env(app_env) and cors_allow_origins == ["*"]:
        errors.append(
            "Invalid production CORS configuration: wildcard origins are not allowed "
            "when APP_ENV=production."
        )

    if errors:
        raise _format_errors(errors)

    if cors_allow_origins == ["*"]:
        logging.getLogger("tuneup.backend").warning(
            "CORS_ALLOW_ORIGINS is '*'. Wildcard CORS should not be used in production."
        )

    return BackendSettings(
        app_env=app_env,
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        supabase_audio_bucket=supabase_audio_bucket,
        supabase_audio_prefix=supabase_audio_prefix,
        cors_allow_origins=cors_allow_origins,
        analysis_job_timeout_seconds=analysis_job_timeout_seconds,
        log_level=log_level,
    )


@lru_cache(maxsize=1)
def get_settings() -> BackendSettings:
    return load_settings()
