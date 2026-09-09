import { useMemo, useState } from 'react'

const TOPICS = [
  'ENERHODAR',
  'CHILDHOOD',
  'GRANDMOTHER',
  'MOTHER',
  'FATHER',
  'FIRST LOVE',
  'GAY',
  'SEX',
  'LOVE',
  'JEALOUSY',
  'LONELINESS',
  'WAR',
  'LOSS',
  'HOME',
  'CITIES',
  'FUTURE',
]

const TOPIC_QUESTIONS = {
  ENERHODAR: 'What do you remember about Enerhodar?',
  CHILDHOOD: 'What do you remember about your childhood?',
  GRANDMOTHER: 'What do you remember about your grandmother?',
  MOTHER: 'What do you remember about your mother?',
  FATHER: 'What do you remember about your father?',
  'FIRST LOVE': 'What do you remember about first love?',
  GAY: 'What do you remember about growing up gay?',
  SEX: 'What do you remember about sex and desire?',
  LOVE: 'What do you remember about love?',
  JEALOUSY: 'What do you remember about jealousy?',
  LONELINESS: 'What do you remember about loneliness?',
  WAR: 'What do you remember about the war?',
  LOSS: 'What do you remember about loss?',
  HOME: 'What does home mean inside you?',
  CITIES: 'What cities do you remember?',
  FUTURE: 'What do you remember about the future?',
}

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

  const hasAnswer = Boolean(answer || error || loading)

  return (
    <section className="ask-book" id="ask-the-little-book">
      <div className="ask-book__inner">
        {!hasAnswer ? (
          <>
            <div className="ask-book__eyebrow">ASK THE LITTLE BOOK</div>
            <h2 className="ask-book__title">The book remembers.<br />You ask.</h2>

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

            <div className="ask-book__topics" aria-label="Suggested topics">
              {TOPICS.map((topic) => (
                <button key={topic} type="button" onClick={() => ask(TOPIC_QUESTIONS[topic])}>
                  {topic}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="ask-book__answer-wrap">
            <div className="ask-book__meta">
              <span>YOU ASKED</span>
              <span>{Math.max(memoryCount, 1)} MEMORY OPENED</span>
            </div>

            <h2 className="ask-book__question">{question}</h2>

            {loading ? (
              <p className="ask-book__loading">I am looking through myself…</p>
            ) : error ? (
              <p className="ask-book__answer">{error}</p>
            ) : (
              <p className="ask-book__answer">{answer}</p>
            )}

            {!loading && followUp && (
              <button className="ask-book__follow" type="button" onClick={() => ask(followUp)}>
                {followUp}
              </button>
            )}

            {!loading && (
              <div className="ask-book__actions">
                <button
                  type="button"
                  onClick={() => {
                    setAnswer('')
                    setFollowUp('')
                    setError('')
                    setQuestion('')
                  }}
                >
                  ASK SOMETHING ELSE
                </button>
                <a href="https://sadgay.com" target="_self">GET THE BOOK</a>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
