import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import RecorderScreen from '@/components/RecorderScreen';
const SITE = 'https://stooorna.com';
const OG = `${SITE}/og-image.svg`;
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [{
    '@type': 'WebSite',
    '@id': `${SITE}/#website`,
    name: 'Stooorna',
    url: `${SITE}/`,
    description: 'Real-time voice app for push-to-talk broadcasts, private whispers, group voice rooms, and instant messaging.'
  }, {
    '@type': 'SoftwareApplication',
    '@id': `${SITE}/#app`,
    name: 'Stooorna',
    url: `${SITE}/`,
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Web',
    description: 'Push-to-talk voice broadcasting, private whispers, group voice rooms, and real-time messaging.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    isPartOf: {
      '@id': `${SITE}/#website`
    }
  }, {
    '@type': 'WebPage',
    '@id': `${SITE}/#webpage`,
    url: `${SITE}/`,
    name: 'Stooorna — Voice, Whisper & Connect',
    isPartOf: {
      '@id': `${SITE}/#website`
    },
    about: {
      '@id': `${SITE}/#app`
    },
    datePublished: '2026-07-30',
    dateModified: '2026-08-14'
  }]
};
export default function HomePage() {
  const navigate = useNavigate();
  return <>
      <Helmet>
        <title>Stooorna — Push-to-Talk Voice, Whisper &amp; Group Rooms</title>
        <meta name="description" content="Stooorna lets you broadcast your voice to everyone, whisper privately to a friend, or join live group voice rooms — all in real time." />
        <link rel="canonical" href={`${SITE}/`} />
        <meta property="og:title" content="Stooorna — Push-to-Talk Voice, Whisper & Group Rooms" />
        <meta property="og:description" content="Broadcast your voice, whisper privately, or join live group voice rooms — all in real time on Stooorna." />
        <meta property="og:image" content={OG} />
        <meta property="og:url" content={`${SITE}/`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Stooorna — Push-to-Talk Voice, Whisper & Group Rooms" />
        <meta name="twitter:description" content="Broadcast your voice, whisper privately, or join live group voice rooms — all in real time." />
        <meta name="twitter:image" content={OG} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <h1 className="sr-only">Stooorna — Push-to-Talk Voice Broadcasting</h1>
      <RecorderScreen theme="cyan" appName="Stooorna" onSettingsPress={() => navigate('/settings')} onUserPress={() => navigate('/add-friend')} onFriendsPress={() => navigate('/add-friend?tab=friends')} onGroupsPress={() => navigate('/add-friend?tab=groups')} onCallPress={() => navigate('/live')} onFeedPress={() => navigate('/feed')} pageTitle="Stooorna Voice Recorder" />
    </>;
}
