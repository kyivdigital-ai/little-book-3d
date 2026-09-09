import { useMemo, useState } from 'react'

export default function AskLittleBook() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([])
  const [answer, setAnswer] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const memoryCount = useMemo(
    () => history.filter((item) => item.role === 'assistant').length,
    [history],
  )

  async function ask(rawQuestion) {
    const cleanQuestion = String(rawQuestion || '').trim()
    if (!cleanQuestion || loading) return

    setLoading(true)
    setError('')
    setQuestion(cleanQuestion)

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: cleanQuestion, history }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The Little Book is quiet right now.')

      const nextAnswer = data.answer || 'That isn’t written inside me.'
      const nextFollowUp = data.follow_up || ''

      setAnswer(nextAnswer)
      setFollowUp(nextFollowUp)
      setHistory((current) => [
        ...current,
        { role: 'user', content: cleanQuestion },
        { role: 'assistant', content: nextAnswer },
      ])
    } catch (err) {
      setError(err.message || 'The Little Book is quiet right now.')
    } finally {
      setLoading(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    ask(question)
  }

  function reset() {
    setAnswer('')
    setFollowUp('')
    setError('')
    setQuestion('')
  }

  const hasAnswer = Boolean(answer || error || loading)

  return (
    <section className={`ask-book ${hasAnswer ? 'ask-book--open' : ''}`} id="ask-the-little-book">
      {!hasAnswer ? (
        <form className="ask-book__form" onSubmit={submit}>
          <input
            aria-label="Ask the Little Book"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask me something."
            maxLength={600}
          />
          <button type="submit" disabled={!question.trim() || loading}>ASK</button>
        </form>
      ) : (
        <div className="ask-book__panel">
          <div className="ask-book__meta">
            <span>{loading ? 'LOOKING THROUGH MYSELF…' : 'THE LITTLE BOOK'}</span>
            <span>{Math.max(memoryCount, 1)} MEMORY OPENED</span>
          </div>

          <p className="ask-book__question">{question}</p>
          <p className="ask-book__answer">
            {loading ? 'I am looking through myself…' : error || answer}
          </p>

          {!loading && followUp && (
            <button className="ask-book__follow" type="button" onClick={() => ask(followUp)}>
              {followUp}
            </button>
          )}

          {!loading && (
            <div className="ask-book__actions">
              <button type="button" onClick={reset}>ASK SOMETHING ELSE</button>
              <a href="https://sadgay.com" target="_self">GET THE BOOK</a>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
