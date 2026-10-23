import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import { tomorrow as lightSyntaxStyle, tomorrowNight as darkSyntaxStyle } from 'react-syntax-highlighter/dist/esm/styles/hljs';

SyntaxHighlighter.registerLanguage('javascript', javascript);

/** The highlighted text of Json5Dialog: loaded only when one opens (the highlighter isn't small). */
export default function JsonHighlight({ text, darkMode }: { text: string, darkMode: boolean }) {
  return (
    <SyntaxHighlighter language="javascript" style={darkMode ? darkSyntaxStyle : lightSyntaxStyle} customStyle={{ textAlign: 'left', maxHeight: '50vh', overflowY: 'auto', fontSize: 14 }}>
      {text}
    </SyntaxHighlighter>
  );
}
