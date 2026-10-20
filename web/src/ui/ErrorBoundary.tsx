// Fehlergrenze: Ein Fehler in einem Bereich legt nicht die ganze App lahm.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Satzanfang für die Meldung, z. B. „Der Bereich „Verlauf““ oder „Dieses Fenster“. */
  label: string;
  /** Wechselt dieser Wert (etwa der Reiter), wird ein neuer Versuch gestartet. */
  resetKey?: unknown;
  /** Kompakte Darstellung, z. B. innerhalb eines Sheets. */
  compact?: boolean;
  /** Eigene Darstellung des Fehlers (z. B. als Sheet mit Schließen-Knopf). */
  wrap?: (content: ReactNode) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function isChunkError(e: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk/i.test(`${e.name} ${e.message}`);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Spotty] Fehler im Bereich ${this.props.label}`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    const content = (
      <div className={`card stack-s${this.props.compact ? "" : " error-card"}`} role="alert">
        <b>{this.props.label} konnte nicht angezeigt werden</b>
        <p className="small">
          {chunk
            ? "Wahrscheinlich gibt es inzwischen eine neue Version der App, oder die Verbindung ist abgerissen. Neu laden behebt das meistens."
            : "Die Daten sind dadurch nicht verloren. Bitte erneut versuchen; wenn es wieder passiert, die App neu laden."}
        </p>
        {!chunk ? <p className="hint">Technische Meldung: {error.message || String(error)}</p> : null}
        <div className="row">
          {!chunk ? (
            <button className="btn small ghost" onClick={() => this.setState({ error: null })}>
              Erneut versuchen
            </button>
          ) : null}
          <button className="btn small primary" onClick={() => location.reload()}>
            App neu laden
          </button>
        </div>
      </div>
    );
    return this.props.wrap ? this.props.wrap(content) : content;
  }
}
