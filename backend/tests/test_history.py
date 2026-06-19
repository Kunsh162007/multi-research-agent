import pytest
from src.history import HistoryStore


@pytest.fixture
def store(tmp_path):
    return HistoryStore(db_path=str(tmp_path / "test_history.db"))


def test_create_and_list_conversation(store):
    store.create_conversation("tid-1", "user-1", "Test query about RAG")
    convs = store.list_conversations("user-1")
    assert len(convs) == 1
    assert convs[0]["thread_id"] == "tid-1"
    assert convs[0]["title"] == "Test query about RAG"


def test_add_and_get_messages(store):
    store.create_conversation("tid-2", "user-1", "Second query")
    store.add_message("tid-2", "user-1", "user", "What is RAG?")
    store.add_message("tid-2", "user-1", "assistant", "RAG stands for…", metadata={"quality": 80})
    msgs = store.get_messages("tid-2", "user-1")
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["metadata"]["quality"] == 80


def test_user_isolation(store):
    store.create_conversation("tid-3", "user-A", "Query A")
    store.create_conversation("tid-4", "user-B", "Query B")
    assert len(store.list_conversations("user-A")) == 1
    assert len(store.list_conversations("user-B")) == 1


def test_search(store):
    store.create_conversation("tid-5", "user-1", "LLM safety research")
    store.add_message("tid-5", "user-1", "user", "Tell me about AI alignment and safety")
    results = store.search("user-1", "alignment")
    assert len(results) == 1
    results_miss = store.search("user-1", "blockchain")
    assert len(results_miss) == 0


def test_delete_conversation(store):
    store.create_conversation("tid-6", "user-1", "To delete")
    store.add_message("tid-6", "user-1", "user", "Hello")
    store.delete_conversation("tid-6", "user-1")
    assert store.get_messages("tid-6", "user-1") == []
    assert store.list_conversations("user-1") == []
