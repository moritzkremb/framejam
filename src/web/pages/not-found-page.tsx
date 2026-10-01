import { HomeHeader } from "@/components/header";
import { NotHere } from "@/components/states";

export function NotFoundPage() {
  return (
    <div className="fc-screen">
      <HomeHeader />
      <main className="fc-main">
        <NotHere title="This page isn't here" message="The link may be old or mistyped." />
      </main>
    </div>
  );
}
