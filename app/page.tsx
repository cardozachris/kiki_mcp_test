'use client';

import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } =
    useChat({
      api: '/api/chat',
      maxSteps: 5,
    });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages?.map(message => {
        console.log('Message:', message);
        return (
          <div key={message.id} className="whitespace-pre-wrap">
            <strong>{`${message.role}: `}</strong>
            {message.parts.map((part, index) => {
              console.log('Part:', part);
              try {
                switch (part.type) {
                  case 'text':
                    const content = part.text;
                    if (typeof content === 'object') {
                      return <div key={index}>{JSON.stringify(content, null, 2)}</div>;
                    }
                    return <div key={index}>{String(content)}</div>;
                  case 'step-start':
                    return index > 0 ? (
                      <div key={index} className="text-gray-500">
                        <hr className="my-2 border-gray-300" />
                      </div>
                    ) : null;
                  case 'tool-invocation': {
                    const { toolInvocation } = part;
                    switch (toolInvocation.toolName) {
                      case 'getWeatherInformation': {
                        switch (toolInvocation.state) {
                          case 'partial-call':
                            return (
                              <pre key={index}>
                                {JSON.stringify(toolInvocation, null, 2)}
                              </pre>
                            );
                          case 'call':
                            return (
                              <div key={index} className="text-gray-500">
                                Getting weather information for{' '}
                                {String(toolInvocation.args?.city || '')}...
                              </div>
                            );
                          case 'result':
                            return (
                              <div key={index} className="text-gray-500">
                                Weather in {String(toolInvocation.args?.city || '')}:{' '}
                                {String(toolInvocation.result || '')}
                              </div>
                            );
                        }
                        break;
                      }
                      case 'echo': {
                        switch (toolInvocation.state) {
                          case 'partial-call':
                            return (
                              <pre key={index}>
                                {JSON.stringify(toolInvocation, null, 2)}
                              </pre>
                            );
                          case 'call':
                            return (
                              <div key={index} className="text-gray-500">
                                Echoing: {String(toolInvocation.args?.message || '')}
                              </div>
                            );
                          case 'result':
                            return (
                              <div key={index} className="text-gray-500">
                                Result: {String(toolInvocation.result || '')}
                              </div>
                            );
                        }
                        break;
                      }
                      case 'get_figma_images_links': {
                        switch (toolInvocation.state) {
                          case 'partial-call':
                            return (
                              <pre key={index}>
                                {JSON.stringify(toolInvocation, null, 2)}
                              </pre>
                            );
                          case 'call':
                            return (
                              <div key={index} className="text-gray-500">
                                Fetching images...
                              </div>
                            );
                          case 'result':
                            return (
                              <div key={index} className="text-gray-500">
                                {toolInvocation.result.content.map((item: { type: string; data: string; mimeType?: string; text?: string }, idx: number) => {
                                  if (item.type === 'image') {
                                    return (
                                      <img 
                                        key={idx}
                                        src={item.data}
                                        alt={`Figma image ${idx}`}
                                        className="max-w-full h-auto my-2"
                                      />
                                    );
                                  }
                                  return (
                                    <pre key={idx} className="whitespace-pre-wrap">
                                      {JSON.stringify(item, null, 2)}
                                    </pre>
                                  );
                                })}
                              </div>
                            );
                        }
                        break;
                      }
                      
                      default:
                        return (
                          <div key={index} className="text-gray-500">
                            {JSON.stringify(toolInvocation, null, 2)}
                          </div>
                        );
                    }
                  }
                }
              } catch (error) {
                console.error('Error processing part:', error);
                return null;
              }
            })}
            <br />
          </div>
        );
      })}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}