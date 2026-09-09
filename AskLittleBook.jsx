import { useState } from 'react'

export default function AskLittleBook() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState([])
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function ask(rawQuestion) {
    const cleanQuestion = String(rawQuestion || '').trim()
    if (!cleanQuestion || loading) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: cleanQuestion, history }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The Little Book is quiet right now.')

      const nextAnswer = data.answer || 'That isn’t written inside me.'
      setAnswer(nextAnswer)
      setHistory((current) => [
        ...current,
        { role: 'user', content: cleanQuestion },
        { role: 'assistant', content: nextAnswer },
      ])
      setQuestion('')
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

  return (
    <section className="ask-book" id="ask-the-little-book">
      {(answer || error || loading) && (
        <div className="ask-book__answer">
          {loading ? '…' : error || answer}
        </div>
      )}

      <form className="ask-book__form" onSubmit={submit}>
        <input
          aria-label="Ask me about book"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask me about book"
          maxLength={600}
        />
      </form>
    </section>
  )
}
