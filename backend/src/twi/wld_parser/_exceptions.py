"""Domain exceptions for B1 - wld-parser."""


class WldParseError(Exception):
    """Raised when a .wld file cannot be parsed."""

    def __init__(
        self,
        message: str,
        code: str | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = dict(details or {})


class UnsupportedWorldVersionError(WldParseError):
    """Raised when the world version is outside the supported range."""

    def __init__(
        self,
        version: int,
        supported_range: tuple[int, int] = (230, 279),
    ) -> None:
        min_version, max_version = supported_range
        super().__init__(
            "Terraria world version "
            f"{version} is not supported. TerraScrap currently supports "
            f"versions {min_version}-{max_version} only.",
            code="unsupported_version",
            details={
                "detected_version": version,
                "supported_range": supported_range,
            },
        )
        self.version = version
        self.detected_version = version
        self.supported_range = supported_range
