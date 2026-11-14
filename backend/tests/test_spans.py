from app.spans import locate

ANSWER = "The Pro plan costs $20.  It renews\nmonthly. The Pro plan costs $20."


def test_exact_match():
    start, end = locate(ANSWER, "The Pro plan costs $20.", set())
    assert (start, end) == (0, 23)


def test_whitespace_normalised_match():
    start, end = locate(ANSWER, "It renews monthly.", set())
    assert ANSWER[start:end] == "It renews\nmonthly."


def test_not_found():
    assert locate(ANSWER, "The Team plan costs $35.", set()) is None
    assert locate(ANSWER, "   ", set()) is None


def test_repeated_text_picks_first_unused_occurrence():
    first = locate(ANSWER, "The Pro plan costs $20.", set())
    second = locate(ANSWER, "The Pro plan costs $20.", {first[0]})
    assert second[0] > first[0]
    assert ANSWER[second[0]:second[1]] == "The Pro plan costs $20."
    assert locate(ANSWER, "The Pro plan costs $20.", {first[0], second[0]}) is None
