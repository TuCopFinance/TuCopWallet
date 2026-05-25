import * as React from 'react'
import { WithTranslation } from 'react-i18next'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { AppEvents } from 'src/analytics/Events'
import { ErrorMessage } from 'src/components/ErrorMessage'
import { withTranslation } from 'src/i18n'
import { restartApp } from 'src/utils/AppRestart'

interface State {
  childError: Error | null
}

interface OwnProps {
  children: React.ReactChild
}

type Props = OwnProps & WithTranslation

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { childError: null }

  componentDidCatch(error: Error, _info: any) {
    this.setState({ childError: error })
    AppAnalytics.track(AppEvents.error_displayed, { error: error.message })
  }

  render() {
    const { childError } = this.state
    if (childError) {
      return (
        <ErrorMessage
          error={childError}
          context={{ screen: 'ErrorBoundary', action: 'componentDidCatch' }}
          variant="fullscreen"
          onDismiss={restartApp}
        />
      )
    }
    return this.props.children
  }
}

export default withTranslation<Props>()(ErrorBoundary)
