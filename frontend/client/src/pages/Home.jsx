import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
function Home() {
  return <div className="min-h-screen flex flex-col">
      <main>
        {
    /* Example: lucide-react for icons */
  }
        <Loader2 className="animate-spin" />
        Example Page
        {
    /* Example: Streamdown for markdown rendering */
  }
        <Streamdown>Any **markdown** content</Streamdown>
        <Button variant="default">Example Button</Button>
      </main>
    </div>;
}
export {
  Home as default
};
