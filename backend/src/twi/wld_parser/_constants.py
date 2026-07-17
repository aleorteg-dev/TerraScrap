"""Shared constants for B1 - wld-parser.

Single source of truth for the supported world version range (IT-15, D06):
both the parser guard and the ``UnsupportedWorldVersionError`` default consume
these, so widening the range can never leave the exception message stale.
"""

from typing import Final

MIN_SUPPORTED_VERSION: Final = 230
MAX_SUPPORTED_VERSION: Final = 319
