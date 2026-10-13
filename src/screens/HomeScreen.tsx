import { useDocumentTitle } from '~/ui/useDocumentTitle'

/** The placeholder home page of the dashboard. */
export function HomeScreen() {
  useDocumentTitle('Home')
  return (
    <>
      <h1>Home</h1>
      <p>You are signed in. Your Organization's dashboard will grow here.</p>
    </>
  )
}
