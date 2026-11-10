import { RedirectToPacking } from './redirect'

// Lista pakowania jest drawerem nad widokami wyjazdu; stary adres otwiera ją na „dziś”.
// Przekierowanie w przeglądarce: redirect() w renderze serwera psuje pomiary Next w dev.
export default function PackingPage() {
  return <RedirectToPacking />
}
