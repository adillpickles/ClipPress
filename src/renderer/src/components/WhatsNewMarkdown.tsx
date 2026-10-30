import Markdown from 'react-markdown';

/** Release highlights as Markdown: loaded only when there are notes to show (the Markdown parser isn't small). */
export default function WhatsNewMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      components={{
        // eslint-disable-next-line react/no-unstable-nested-components
        code(props) {
          // eslint-disable-next-line react/jsx-props-no-spreading
          return <code className="highlighted" {...props} />;
        },
      }}
    >
      {children}
    </Markdown>
  );
}
