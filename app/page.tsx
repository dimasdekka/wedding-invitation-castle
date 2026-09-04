"use client";

import { useEffect, useState } from "react";
import { ReferenceFrame } from "./components/reference-frame";

const supportedGuestParams = new Set(["to", "dear", "kepada", "source"]);

export default function Home() {
  const [queryString, setQueryString] = useState("");

  useEffect(() => {
    const query = new URLSearchParams();
    for (const [key, value] of new URLSearchParams(window.location.search)) {
      if (supportedGuestParams.has(key) && value.trim()) query.set(key, value);
    }
    setQueryString(query.toString() ? `?${query.toString()}` : "");
  }, []);

  return (
    <main className="clone">
      <ReferenceFrame queryString={queryString} />
    </main>
  );
}
