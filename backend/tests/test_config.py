import pytest

from config import BackendConfigurationError, load_settings


def valid_env(**overrides):
    values = {
        "APP_ENV": "development",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_KEY": "service-key",
        "SUPABASE_AUDIO_BUCKET": "audio-uploads",
        "SUPABASE_AUDIO_PREFIX": "analysis",
        "CORS_ALLOW_ORIGINS": "http://localhost:8081,http://localhost:19006",
    }
    values.update(overrides)
    return values


def test_valid_config_passes():
    settings = load_settings(valid_env())

    assert settings.app_env == "development"
    assert settings.supabase_url == "https://example.supabase.co"
    assert settings.supabase_key == "service-key"
    assert settings.supabase_audio_bucket == "audio-uploads"
    assert settings.supabase_audio_prefix == "analysis"
    assert settings.cors_allow_origins == ["http://localhost:8081", "http://localhost:19006"]
    assert settings.analysis_job_timeout_seconds == 900


def test_missing_supabase_url_fails():
    env = valid_env()
    env.pop("SUPABASE_URL")

    with pytest.raises(BackendConfigurationError, match="SUPABASE_URL"):
        load_settings(env)


def test_missing_supabase_key_fails():
    env = valid_env()
    env.pop("SUPABASE_KEY")

    with pytest.raises(BackendConfigurationError, match="SUPABASE_KEY"):
        load_settings(env)


def test_invalid_supabase_url_fails():
    with pytest.raises(BackendConfigurationError, match="Invalid SUPABASE_URL"):
        load_settings(valid_env(SUPABASE_URL="http://your-project.supabase.co"))


def test_double_assignment_cors_fails():
    with pytest.raises(BackendConfigurationError, match="Invalid CORS_ALLOW_ORIGINS"):
        load_settings(valid_env(CORS_ALLOW_ORIGINS="CORS_ALLOW_ORIGINS=*"))


def test_empty_cors_entry_fails():
    with pytest.raises(BackendConfigurationError, match="Invalid CORS_ALLOW_ORIGINS"):
        load_settings(valid_env(CORS_ALLOW_ORIGINS="http://localhost:8081,"))


def test_malformed_cors_origin_fails():
    with pytest.raises(BackendConfigurationError, match="Origins must be comma-separated"):
        load_settings(valid_env(CORS_ALLOW_ORIGINS="localhost:8081"))


def test_wildcard_cors_allowed_in_development(caplog):
    settings = load_settings(valid_env(CORS_ALLOW_ORIGINS="*"))

    assert settings.cors_allow_origins == ["*"]
    assert "Wildcard CORS should not be used in production" in caplog.text


def test_wildcard_cors_rejected_in_production():
    with pytest.raises(BackendConfigurationError, match="wildcard origins are not allowed"):
        load_settings(valid_env(APP_ENV="production", CORS_ALLOW_ORIGINS="*"))


def test_wildcard_cors_rejected_when_env_alias_is_production():
    env = valid_env(CORS_ALLOW_ORIGINS="*")
    env.pop("APP_ENV")
    env["ENV"] = "production"

    with pytest.raises(BackendConfigurationError, match="wildcard origins are not allowed"):
        load_settings(env)


def test_comma_separated_cors_origins_parse_correctly():
    settings = load_settings(
        valid_env(
            CORS_ALLOW_ORIGINS=(
                "http://localhost:8081, http://localhost:19006, http://127.0.0.1:8000"
            )
        )
    )

    assert settings.cors_allow_origins == [
        "http://localhost:8081",
        "http://localhost:19006",
        "http://127.0.0.1:8000",
    ]


def test_log_level_defaults_to_info_if_missing():
    settings = load_settings(valid_env())

    assert settings.log_level == "INFO"


def test_storage_settings_reject_surrounding_quotes_and_spaces():
    with pytest.raises(BackendConfigurationError) as exc_info:
        load_settings(
            valid_env(
                SUPABASE_AUDIO_BUCKET='"audio-uploads"',
                SUPABASE_AUDIO_PREFIX=" analysis",
            )
        )

    message = str(exc_info.value)
    assert "SUPABASE_AUDIO_BUCKET must not contain surrounding quotes" in message
    assert "SUPABASE_AUDIO_PREFIX must not contain leading or trailing spaces" in message
