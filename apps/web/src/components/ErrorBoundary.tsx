import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tr } from '../i18n';
import { Button } from './ui';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

/** Catches unexpected render errors so a broken view never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled view error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section
        role="alert"
        className="mx-auto my-12 max-w-lg space-y-4 rounded-[6px] border border-bad/40 border-l-[3px] border-l-bad bg-surface p-6"
      >
        <div className="space-y-1.5">
          <p className="font-mono-code text-[11px] font-semibold tracking-wider text-bad-ink uppercase">
            {tr('Unexpected error')}
          </p>
          <h1 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink">
            {tr('Something went wrong on this page')}
          </h1>
          <p className="text-[13px] leading-[20px] text-muted">
            {tr('Your saved data is safe. Try reloading this view or returning to the home page.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <Button type="button" onClick={this.handleReset}>
            {tr('Try again')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.location.assign('/');
            }}
          >
            {tr('Go to home')}
          </Button>
        </div>
      </section>
    );
  }
}
