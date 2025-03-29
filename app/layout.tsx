import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { EthPriceProvider } from "./utils/EthPriceProvider";
import { DataProvider } from "./utils/DataProvider";

export const metadata: Metadata = {
  title: "PYUSD",
  description: "stability adoption tool 2025",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Protest+Guerrilla&family=Jacques+Francois+Shadow
          &family=Texturina:ital,opsz,wght@0,12..72,100..900;1,12..72,100..900&family=Red+Rose:wght@300..700&
          family=MuseoModerno:ital,wght@0,100..900;1,100..900&family=Montserrat:ital,wght@0,100..900;1,100..900&
          family=Gowun+Batang:wght@400;700&family=Space+Grotesk:wght@300..700&family=Josefin+Sans:ital,wght@0,100..700;1,100..700&display=swap"
          rel="stylesheet"
        />
        {/* <link
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"
          rel="stylesheet"
        /> */}
      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/all.css"
      />

      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/sharp-solid.css"
      />

      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/sharp-regular.css"
      />

      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/sharp-light.css"
      />
      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/duotone.css"
      />
      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/sharp-duotone.css"
      />
      <link
        rel="stylesheet"
        href="https://site-assets.fontawesome.com/releases/v6.7.2/css/brands.css"
      />
      </head>
      <body
        // className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ fontFamily: 'Roboto, sans-serif' }} // Apply the Google Font
      >
        <EthPriceProvider>
        <DataProvider>
        {children}
        </DataProvider>
        </EthPriceProvider>
        
      </body>
    </html>
  );
}
