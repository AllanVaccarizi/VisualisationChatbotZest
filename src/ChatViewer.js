import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, MessageSquare, User, Bot, Calendar, Edit3 } from 'lucide-react';
import './ChatViewer.css';

// Configuration Supabase
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Vérification des variables d'environnement
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Variables d\'environnement Supabase manquantes');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const ChatViewer = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSession, setEditingSession] = useState(null);
  const [newSessionName, setNewSessionName] = useState('');
  const messagesEndRef = useRef(null);

  // Charger les conversations
  useEffect(() => {
    loadConversations();
    
    // Mise à jour automatique toutes les 3 secondes
    const interval = setInterval(() => {
      loadConversations();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Mise à jour des messages de la conversation sélectionnée
  useEffect(() => {
    if (selectedConversation) {
      const interval = setInterval(() => {
        loadMessages(selectedConversation.session_id);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [selectedConversation]);

  // Auto-scroll vers le bas des messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('zest_chat')
        .select('session_id, created_at, display_name')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Grouper par session_id et garder la plus récente avec le display_name
      const sessionsMap = new Map();
      data.forEach(row => {
        const sessionId = row.session_id;
        if (!sessionsMap.has(sessionId) || new Date(row.created_at) > new Date(sessionsMap.get(sessionId).created_at)) {
          sessionsMap.set(sessionId, {
            session_id: sessionId,
            created_at: row.created_at,
            display_name: row.display_name || `Conversation ${sessionId.substring(0, 8)}...`
          });
        }
      });

      const newConversations = Array.from(sessionsMap.values());
      setConversations(newConversations);
      setLoading(false);
    } catch (error) {
      console.error('Erreur lors du chargement des conversations:', error);
      setLoading(false);
    }
  };

  const loadMessages = async (sessionId) => {
    try {
      const { data, error } = await supabase
        .from('zest_chat')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const parsedMessages = data.map(row => {
        let parsedMessage;
        try {
          parsedMessage = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
        } catch (e) {
          parsedMessage = { type: 'unknown', content: 'Message non parsable' };
        }

        return {
          id: row.id,
          type: parsedMessage.type,
          content: parsedMessage.content,
          timestamp: row.created_at
        };
      });

      // Ne mettre à jour que si les messages ont changé
      setMessages(prevMessages => {
        const newMessagesString = JSON.stringify(parsedMessages);
        const prevMessagesString = JSON.stringify(prevMessages);
        
        if (newMessagesString !== prevMessagesString) {
          return parsedMessages;
        }
        return prevMessages;
      });
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
    }
  };

  const handleConversationClick = (conversation) => {
    setSelectedConversation(conversation);
    loadMessages(conversation.session_id);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRenameStart = (e, conversation) => {
    e.stopPropagation();
    setEditingSession(conversation.session_id);
    setNewSessionName(conversation.display_name);
  };

  const updateDisplayNameInDatabase = async (sessionId, newName) => {
    try {
      // Mettre à jour tous les messages de cette session avec le nouveau nom
      const { error } = await supabase
        .from('zest_chat')
        .update({ display_name: newName })
        .eq('session_id', sessionId);

      if (error) {
        console.error('Erreur lors de la mise à jour du nom:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du nom:', error);
      return false;
    }
  };

  const handleRenameSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    
    if (newSessionName.trim() === '') {
      setEditingSession(null);
      return;
    }

    // Mettre à jour en base de données
    const success = await updateDisplayNameInDatabase(editingSession, newSessionName.trim());
    
    if (success) {
      // Mettre à jour le state local seulement si la BDD a été mise à jour avec succès
      setConversations(prev => prev.map(conv => 
        conv.session_id === editingSession 
          ? { ...conv, display_name: newSessionName.trim() }
          : conv
      ));
      
      // Mettre à jour la conversation sélectionnée si c'est celle qui a été renommée
      if (selectedConversation && selectedConversation.session_id === editingSession) {
        setSelectedConversation(prev => ({
          ...prev,
          display_name: newSessionName.trim()
        }));
      }
    } else {
      alert('Erreur lors de la sauvegarde du nom. Veuillez réessayer.');
    }
    
    setEditingSession(null);
    setNewSessionName('');
  };

  const handleRenameCancel = () => {
    setEditingSession(null);
    setNewSessionName('');
  };

  const filteredConversations = conversations.filter(conv =>
    conv.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.session_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="chat-viewer">
      {/* Sidebar - Liste des conversations */}
      <div className="sidebar">
        {/* Header avec recherche */}
        <div className="sidebar-header">
          <h1 className="sidebar-title">Conversations Chatbot</h1>
          <div className="search-container">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher une conversation..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Liste des conversations */}
        <div className="conversations-list">
          {loading ? (
            <div className="loading">
              <div className="loading-text">Chargement...</div>
            </div>
          ) : (
            <div className="conversations-container">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.session_id}
                  className={`conversation-item ${
                    selectedConversation?.session_id === conversation.session_id 
                      ? 'conversation-selected' 
                      : ''
                  }`}
                  onClick={() => handleConversationClick(conversation)}
                >
                  <div className="conversation-content">
                    <div className="conversation-main">
                      <MessageSquare className="conversation-icon" />
                      {editingSession === conversation.session_id ? (
                        <div className="edit-container">
                          <input
                            type="text"
                            value={newSessionName}
                            onChange={(e) => setNewSessionName(e.target.value)}
                            className="edit-input"
                            onBlur={handleRenameCancel}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameSubmit(e);
                              } else if (e.key === 'Escape') {
                                handleRenameCancel();
                              }
                            }}
                            autoFocus
                            maxLength={100}
                          />
                        </div>
                      ) : (
                        <div className="conversation-info">
                          <p className="conversation-name">
                            {conversation.display_name}
                          </p>
                          <p className="conversation-id">
                            {conversation.session_id.substring(0, 16)}...
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="conversation-actions">
                      <button
                        onClick={(e) => handleRenameStart(e, conversation)}
                        className="rename-button"
                        title="Renommer la conversation"
                      >
                        <Edit3 className="rename-icon" />
                      </button>
                    </div>
                  </div>
                  <div className="conversation-date">
                    <Calendar className="date-icon" />
                    {formatTime(conversation.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Zone principale - Messages */}
      <div className="main-content">
        {selectedConversation ? (
          <>
            {/* Header de la conversation */}
            <div className="chat-header">
              <h2 className="chat-title">
                {selectedConversation.display_name}
              </h2>
              <p className="chat-session">
                Session ID: {selectedConversation.session_id}
              </p>
            </div>

            {/* Messages */}
            <div className="messages-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.type === 'human' ? 'message-human' : 'message-ai'}`}
                >
                  <div className="message-content">
                    {/* Avatar */}
                    <div className={`avatar ${message.type === 'human' ? 'avatar-human' : 'avatar-ai'}`}>
                      {message.type === 'human' ? (
                        <User className="avatar-icon" />
                      ) : (
                        <Bot className="avatar-icon" />
                      )}
                    </div>

                    {/* Bulle de message */}
                    <div className="message-wrapper">
                      <div className={`message-bubble ${
                        message.type === 'human' 
                          ? 'bubble-human' 
                          : 'bubble-ai'
                      }`}>
                        <p className="message-text">
                          {message.content}
                        </p>
                      </div>
                      <p className="message-time">
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-content">
              <MessageSquare className="empty-icon" />
              <h3 className="empty-title">
                Sélectionnez une conversation
              </h3>
              <p className="empty-text">
                Choisissez une conversation dans la liste pour voir les messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatViewer;