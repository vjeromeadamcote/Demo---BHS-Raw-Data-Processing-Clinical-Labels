"""Feature extraction library — curated catalog for Feature Lab.

Each feature is a pure function of a pandas DataFrame (the modality's signal
window) and returns either a scalar metric or a dict of named metrics. Adding
a new feature: implement a function here, register it in `registry.py`.
"""
