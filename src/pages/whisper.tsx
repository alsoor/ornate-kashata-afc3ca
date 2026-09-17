import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import RecorderScreen from '@/components/RecorderScreen';
const SITE = 'https://stooorna.com';
const OG = `${SITE}/og-image.svg`;
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${SITE}/whisper#webpage`,
  name: 'Whisper Mode — Stooorna',
  url: `${SITE}/whisper`,
  description: 'Send a private voice whisper to a friend using push-to-talk on Stooorna.',
  isPartOf: {
    '@id': `${SITE}/#website`
  }
};
export default function WhisperPage() {
  const navigate = useNavigate();
  return <>
      <Helmet>
        <title>Whisper — Private Voice Messages | Stooorna</title>
        <meta name="description" content="Hold to whisper a private voice message to any friend on Stooorna. Real-time, intimate, and instant." />
        <link rel="canonical" href={`${SITE}/whisper`} />
        <meta property="og:title" content="Whisper — Private Voice Messages | Stooorna" />
        <meta property="og:description" content="Hold to whisper a private voice message to any friend on Stooorna. Real-time, intimate, and instant." />
        <meta property="og:image" content={OG} />
        <meta property="og:url" content={`${SITE}/whisper`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Whisper — Private Voice Messages | Stooorna" />
        <meta name="twitter:description" content="Hold to whisper a private voice message to any friend on Stooorna." />
        <meta name="twitter:image" content={OG} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <h1 className="sr-only">Whisper Mode — Stooorna</h1>
      <RecorderScreen theme="bronze" appName="Stooorna" onSettingsPress={() => navigate('/settings')} onUserPress={() => navigate('/add-friend')} pageTitle="Whisper Mode — Stooorna" />
    </>;
}
