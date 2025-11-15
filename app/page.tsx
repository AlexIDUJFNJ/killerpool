export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">
          Killerpool
        </h1>
        <p className="text-xl text-muted-foreground">
          Modern Killer Pool For You And Your Friends
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">
            Start Game
          </button>
        </div>
      </div>
    </main>
  )
}
