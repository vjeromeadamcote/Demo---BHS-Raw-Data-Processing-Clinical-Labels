"""Streamlit entrypoint for the Workbench browser app."""

import streamlit as st

st.set_page_config(
    page_title="BHS Clinical Labels",
    page_icon="📊",
    layout="wide",
)

st.title("BHS raw data and clinical labels")
st.caption(
    "Workbench app — wire this page to your workspace data (BigQuery, GCS, or files)."
)

st.info(
    "This is a starter dashboard. Add `pandas` loads, charts, and filters as your "
    "collection pipeline produces tables or exports."
)
