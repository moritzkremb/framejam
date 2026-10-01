import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage({ message = "This page doesn't exist." }: { message?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight text-muted-foreground/60">404</p>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild variant="secondary">
        <Link to="/">Back to reviews</Link>
      </Button>
    </div>
  );
}
