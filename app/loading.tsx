export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <div className="relative mb-4 mx-auto">
          {/* Spinner */}
          <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
        </div>
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    </main>
  )
}
