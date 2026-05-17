"""
LangGraph pipeline.

Flow: RAG → Generate markdown → Quality Check → (pass: JSON conversion → Format / fail: repair Generate)
Max iterations: 2 (from settings.MAX_ITERATIONS)
"""

from langgraph.graph import StateGraph, END
from app.graph.state import GraphState
from app.graph.nodes import rag, generator, quality_checker, json_converter, formatter
from app.config import settings


def should_retry(state: GraphState) -> str:
    """
    Conditional edge after quality_check.
    Returns "pass" to proceed to formatter, or "retry" to re-run generator.
    """
    qr = state.get("quality_result", {})
    iteration = state.get("iteration", 0)

    # Pass if quality check passed OR max iterations reached
    if qr.get("status") == "PASSED" or iteration >= settings.MAX_ITERATIONS:
        return "pass"
    return "retry"


def build_pipeline() -> StateGraph:
    """Build and compile the LangGraph StateGraph."""
    graph = StateGraph(GraphState)

    graph.add_node("rag_retrieval", rag.run)
    graph.add_node("generator", generator.run)
    graph.add_node("quality_check", quality_checker.run)
    graph.add_node("json_converter", json_converter.run)
    graph.add_node("formatter", formatter.run)

    # Define edges
    graph.set_entry_point("rag_retrieval")
    graph.add_edge("rag_retrieval", "generator")
    graph.add_edge("generator", "quality_check")
    graph.add_conditional_edges(
        "quality_check",
        should_retry,
        {
            "pass": "json_converter",
            "retry": "generator",
        },
    )
    graph.add_edge("json_converter", "formatter")
    graph.add_edge("formatter", END)

    return graph.compile()


# Singleton compiled pipeline
pipeline = build_pipeline()
