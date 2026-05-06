import logging

try:
    from convex import ConvexClient
except ImportError:
    ConvexClient = None

from utils.config import settings

logger = logging.getLogger(__name__)


def convex_client():
    if ConvexClient is None:
        logger.error("convex Python package is not installed")
        return None
    if not settings.convex_url or not settings.convex_app_secret:
        return None

    client = ConvexClient(settings.convex_url)
    if getattr(settings, "convex_admin_key", None):
        client.set_admin_auth(settings.convex_admin_key)
    return client


def convex_args(**kwargs):
    return {"appSecret": settings.convex_app_secret, **kwargs}
