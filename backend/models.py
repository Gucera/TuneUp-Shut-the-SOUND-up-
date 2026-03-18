from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# User profile data
class UserProfile(BaseModel):
    email: str
    instrument: str  # 'guitar', 'piano', 'drums'
    level: int = 1   # starting level
    xp: int = 0      # starting points

# Marker for a specific moment in a song
class TrafficMarker(BaseModel):
    time: float
    label: str

# Full analysis data for a song
class TrafficData(BaseModel):
    filename: str
    bpm: float
    duration: float
    sample_rate: int
    key: Optional[str] = None
    created_at: Optional[datetime] = None
    markers: List[TrafficMarker] = []