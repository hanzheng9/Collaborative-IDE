import ReactMarkdown from "react-markdown";

type AiResultViewProps = {
  result: string;
};

export function AiResultView({ result }: AiResultViewProps) {
  return (
    <div className="aiResult">
      <ReactMarkdown skipHtml>{result}</ReactMarkdown>
    </div>
  );
}
