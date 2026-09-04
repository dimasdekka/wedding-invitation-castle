import { invitationConfig } from "../config";

type ReferenceFrameProps = {
  queryString?: string;
};

export function ReferenceFrame({ queryString = "" }: ReferenceFrameProps) {
  return (
    <iframe
      title={invitationConfig.title}
      src={`${invitationConfig.sourcePath}${queryString}`}
      allow="autoplay"
      className="reference-frame"
    />
  );
}
