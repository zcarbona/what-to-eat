import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/States'
import { useTitle } from '../hooks/useAsync'

export function NotFoundPage() {
  useTitle('Page not found')
  return (
    <div className="page">
      <EmptyState
        showIllustration
        title="This page doesn't exist"
        action={
          <Link to="/" className="btn btn-primary">
            Go home
          </Link>
        }
      >
        The link may be broken or the page may have moved.
      </EmptyState>
    </div>
  )
}
