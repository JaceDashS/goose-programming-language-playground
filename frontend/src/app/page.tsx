import type { Metadata } from "next";
import Playground from "@/components/Playground";

export const metadata: Metadata = {
  title: "Goose Playground | Run Goose programming examples online",
  description: "Write and run Goose programs in a browser editor, explore examples and connect AI coding tools over MCP.",
  alternates: { canonical: "https://goose-playground.jace-s.com/" },
  openGraph: { title: "Goose Playground | Run Goose programming examples online", description: "Write and run Goose programs in a browser editor, explore examples and connect AI coding tools over MCP.", url: "https://goose-playground.jace-s.com/", images: ["https://goose-playground.jace-s.com/icon-512.png"] },
};

export default function Home() {
  return <Playground />;
}
