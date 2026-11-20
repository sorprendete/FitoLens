"""Logs en una línea por evento, legibles con `docker compose logs api`."""
import logging


def configurar_logs(nivel: str) -> None:
    logging.basicConfig(
        level=nivel.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
