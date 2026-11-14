export function EmptyState({ hasSamples }: { hasSamples: boolean }) {
  return (
    <section className="card empty" aria-labelledby="empty-title">
      <h2 id="empty-title">Is that answer still true?</h2>
      <p>
        Language models state prices, versions, laws and job titles with full confidence, even after they changed.
        StaleGuard finds those claims in an answer and checks each one against live sources.
      </p>
      <p>
        {hasSamples
          ? "Paste an answer above, or pick one of the samples to see a report."
          : "Paste an answer above to see a report."}
      </p>
    </section>
  );
}

export function ErrorNotice({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: (() => void) | null;
}) {
  return (
    <div className="notice" role="alert">
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
