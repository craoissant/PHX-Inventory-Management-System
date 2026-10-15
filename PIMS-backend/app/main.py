from fastapi import Depends, FastAPI
from app.routes.requests import router as requests_router
from app.auth import get_current_user
from app.routes.assets import router as assets_router
from app.routes.kits import router as kits_router
from app.routes.people import router as people_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="PIMS Backend",
    description="PHX Inventory Management System API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",

    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(requests_router)

app.include_router(assets_router)

app.include_router(kits_router)

app.include_router(people_router)


@app.get("/")
def root():
    return {
        "message": "PIMS backend is running"
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok"
    }


@app.get("/api/auth/me")
def get_me(current_user=Depends(get_current_user)):
    return current_user
