import os

import psycopg
from dotenv import load_dotenv


load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")


if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in the .env file")


def get_connection():
    return psycopg.connect(
        DATABASE_URL,
        connect_timeout=10,
    )