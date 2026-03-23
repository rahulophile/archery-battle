import './globals.css';

export const metadata = {
  title: 'Archery Battle — Two Player Archery Game',
  description: 'Play online archery with a friend or computer. Angry Birds style aiming!',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="rotate-message">
          <div className="rotate-icon">📱</div>
          <h2>Please Rotate Device</h2>
          <p>This game requires landscape mode.</p>
        </div>
        <div id="app-content">
          {children}
        </div>
      </body>
    </html>
  );
}
