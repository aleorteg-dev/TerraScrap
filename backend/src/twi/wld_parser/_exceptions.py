"""Domain exceptions for B1 – wld-parser."""


class WldParseError(Exception):
    """Raised when a .wld file cannot be parsed."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


class UnsupportedWorldVersionError(WldParseError):
    """Raised when the world version is outside the supported range."""

    def __init__(self, version: int) -> None:
        super().__init__(
            f"Unsupported world version {version}; supported range is 230–279.",
            code="unsupported_version",
        )
        self.version = version
