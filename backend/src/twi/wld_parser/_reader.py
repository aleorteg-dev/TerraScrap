"""Binary reader utilities for the .wld parser."""

from __future__ import annotations

import struct
from typing import BinaryIO

from twi.wld_parser._exceptions import WldParseError


class Reader:
    """Thin wrapper around a BinaryIO stream with typed read helpers."""

    __slots__ = ("_stream",)

    def __init__(self, stream: BinaryIO) -> None:
        self._stream = stream

    # ── positional ────────────────────────────────────────────────────────
    def tell(self) -> int:
        return self._stream.tell()

    def seek(self, pos: int) -> None:
        self._stream.seek(pos)

    # ── raw ───────────────────────────────────────────────────────────────
    def read_bytes(self, n: int) -> bytes:
        data = self._stream.read(n)
        if len(data) != n:
            raise WldParseError(
                f"Unexpected end of file: expected {n} bytes, got {len(data)}.",
                code="truncated",
            )
        return data

    # ── scalars ───────────────────────────────────────────────────────────
    def read_byte(self) -> int:
        return int(struct.unpack_from("<B", self.read_bytes(1))[0])

    def read_bool(self) -> bool:
        return self.read_byte() != 0

    def read_int16(self) -> int:
        return int(struct.unpack_from("<h", self.read_bytes(2))[0])

    def read_uint16(self) -> int:
        return int(struct.unpack_from("<H", self.read_bytes(2))[0])

    def read_int32(self) -> int:
        return int(struct.unpack_from("<i", self.read_bytes(4))[0])

    def read_uint32(self) -> int:
        return int(struct.unpack_from("<I", self.read_bytes(4))[0])

    def read_int64(self) -> int:
        return int(struct.unpack_from("<q", self.read_bytes(8))[0])

    def read_uint64(self) -> int:
        return int(struct.unpack_from("<Q", self.read_bytes(8))[0])

    def read_float32(self) -> float:
        return float(struct.unpack_from("<f", self.read_bytes(4))[0])

    def read_double(self) -> float:
        return float(struct.unpack_from("<d", self.read_bytes(8))[0])

    # ── .NET string (LEB128 length + UTF-8 payload) ───────────────────────
    def read_net_string(self) -> str:
        length = 0
        shift = 0
        while True:
            b = self.read_byte()
            length |= (b & 0x7F) << shift
            if not (b & 0x80):
                break
            shift += 7
            if shift >= 35:  # sanity guard
                raise WldParseError("Malformed .NET string length.", code="corrupt")
        raw = self.read_bytes(length)
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            pass
        try:
            # Older Terraria worlds (pre-Unicode client) stored strings in
            # Windows-1252.
            return raw.decode("cp1252")
        except UnicodeDecodeError:
            # 0x81, 0x8D, 0x8F, 0x90 and 0x9D are undefined in cp1252.
            # latin-1 maps every byte, so string decoding never raises (E11).
            return raw.decode("latin-1")
