
import os

from dotenv import load_dotenv
from psycopg_pool import ConnectionPool


load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")


if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in the .env file")


pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=1,
    max_size=5,
    timeout=10,
    kwargs={"connect_timeout": 10},
    open=True,
)


def get_connection():
    return pool.connection()
