import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { ApiLoggerViewer } from "@/components/api-logger-viewer"
import "./globals.css"
import Provider from "./Provider"
import { Toaster } from "@/components/toaster"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "Marketplace Demo",
  description: "A marketplace demo showcasing customer sign-up with Ezypay integration",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
        >
          <Provider>
            <main className="min-h-screen">
              {children}
              <Toaster />
            </main>
            <ApiLoggerViewer />
          </Provider>
        </ThemeProvider>
      </body>
    </html>
  )
}
