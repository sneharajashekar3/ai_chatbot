import { Message } from '@/lib/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, RefreshCw, Check, ExternalLink, Volume2, Square, Wand2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
  message: Message;
  isLast: boolean;
  isGenerating?: boolean;
  onModify?: (instruction: string) => void;
  onEditMessage?: (id: string, newText: string) => void;
}

export function MessageBubble({ message, isLast, isGenerating, onModify, onEditMessage }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text);

  useEffect(() => {
    return () => {
      if (isPlaying) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSpeech = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(message.text);
      utterance.onend = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("group flex w-full gap-2 sm:gap-4 py-4 sm:py-6", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <Avatar className="w-6 h-6 sm:w-8 sm:h-8 border border-border shrink-0 mt-1">
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px] sm:text-xs">AI</AvatarFallback>
        </Avatar>
      )}
      
      <div className={cn(
        "flex flex-col gap-1.5 sm:gap-2 max-w-[90%] md:max-w-[80%]",
        isUser ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "px-3 sm:px-4 py-2 sm:py-3 rounded-2xl text-sm sm:text-base",
          isUser 
            ? "bg-primary text-primary-foreground rounded-tr-sm" 
            : "bg-muted text-foreground rounded-tl-sm"
        )}>
          {message.mediaUrl && message.mediaType === 'image' && (
            <img src={message.mediaUrl} alt="Generated" className="max-w-full rounded-lg mb-2" referrerPolicy="no-referrer" />
          )}
          {message.mediaUrl && message.mediaType === 'video' && (
            <video src={message.mediaUrl} controls className="max-w-full rounded-lg mb-2" />
          )}
          {message.mediaUrl && message.mediaType === 'audio' && (
            <audio src={message.mediaUrl} controls className="w-full mb-2" />
          )}
          
          {isUser ? (
            isEditing ? (
              <div className="flex flex-col gap-2 w-full min-w-[200px] sm:min-w-[300px]">
                <Textarea 
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="min-h-[80px] bg-background text-foreground resize-y"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setIsEditing(false); setEditValue(message.text); }}>Cancel</Button>
                  <Button size="sm" onClick={() => {
                    if (editValue.trim() && editValue !== message.text && onEditMessage) {
                      onEditMessage(message.id, editValue.trim());
                    }
                    setIsEditing(false);
                  }}>Save & Regenerate</Button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words">{message.text}</div>
            )
          ) : (
            <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none break-words">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    return !inline && match ? (
                      <SyntaxHighlighter
                        {...props}
                        children={String(children).replace(/\n$/, '')}
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                      />
                    ) : (
                      <code {...props} className={className}>
                        {children}
                      </code>
                    )
                  }
                }}
              >
                {message.text}
              </ReactMarkdown>
              {!isUser && isLast && isGenerating && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="inline-block w-1.5 h-4 bg-primary/80 ml-0.5 align-middle rounded-full"
                />
              )}
            </div>
          )}
        </div>
        
        {message.groundingUrls && message.groundingUrls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <ExternalLink size={12} />
              Sources
            </div>
            <div className="flex flex-wrap gap-2">
              {message.groundingUrls.map((url, index) => {
                try {
                  const hostname = new URL(url).hostname;
                  return (
                    <a 
                      key={index} 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-secondary/50 text-secondary-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary transition-colors border border-border/50"
                    >
                      <span className="truncate max-w-[200px]">{hostname}</span>
                    </a>
                  );
                } catch (e) {
                  return null;
                }
              })}
            </div>
          </div>
        )}

        <div className={cn(
          "flex items-center gap-1 mt-1",
          isUser ? "flex-row-reverse" : "flex-row"
        )}>
          {!isUser && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={toggleSpeech} title={isPlaying ? "Stop speaking" : "Read aloud"}>
                {isPlaying ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              {onModify && !isGenerating && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Modify response" />}>
                    <Wand2 className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => onModify('Shorter')}>Shorter</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onModify('Longer')}>Longer</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onModify('Simpler')}>Simpler</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onModify('More Professional')}>More Professional</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onModify('More Casual')}>More Casual</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
          {isUser && !isEditing && onEditMessage && !isGenerating && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setIsEditing(true)} title="Edit message">
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleCopy} title="Copy to clipboard">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isUser && (
        <Avatar className="w-8 h-8 border border-border">
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">U</AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}
