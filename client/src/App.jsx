import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from './socket/socket';

const NotificationBell = ({ enabled }) => {
	const audioRef = useRef(null);
	const beepSrc =
		'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAaW5mbyAgICAgICAgICAgICAgICAg'; // tiny beep placeholder
	useEffect(() => {
		if (!('Notification' in window)) return;
		if (Notification.permission === 'default') {
			Notification.requestPermission();
		}
	}, []);
	return (
		<audio ref={audioRef} src={beepSrc} preload="auto" style={{ display: 'none' }} />
	);
};

const UsernameForm = ({ onSubmit }) => {
	const [name, setName] = useState('');
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (name.trim()) onSubmit(name.trim());
			}}
			style={{ display: 'flex', gap: 8, marginBottom: 16 }}
		>
			<input
				type="text"
				placeholder="Enter a username"
				value={name}
				onChange={(e) => setName(e.target.value)}
				style={{ flex: 1, padding: 8 }}
			/>
			<button type="submit" style={{ padding: '8px 12px' }}>
				Join
			</button>
		</form>
	);
};

const UserList = ({ users, onPrivate }) => {
	return (
		<div style={{ borderRight: '1px solid #ddd', paddingRight: 12, width: 220 }}>
			<h3 style={{ marginTop: 0 }}>Online</h3>
			<ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
				{users.map((u) => (
					<li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
						<span>● {u.username}</span>
						<button onClick={() => onPrivate(u)} style={{ fontSize: 12, padding: '4px 6px' }}>
							PM
						</button>
					</li>
				))}
			</ul>
		</div>
	);
};

const Message = ({ msg, selfId, onRead }) => {
	useEffect(() => {
		// mark as read when rendered
		if (!msg.system && typeof onRead === 'function') {
			onRead(msg);
		}
	}, [msg, onRead]);
	const isSelf = msg.senderId === selfId;
	return (
		<div style={{ marginBottom: 8 }}>
			<div style={{ fontSize: 12, color: '#666' }}>
				{msg.system ? 'System' : msg.sender}{' '}
				<span style={{ opacity: 0.7 }}>
					{new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
				</span>
				{msg.isPrivate && <span style={{ marginLeft: 6, color: '#b21' }}>(private)</span>}
				{isSelf && msg.read && <span style={{ marginLeft: 6, color: '#2b8' }}>✓ Read</span>}
			</div>
			<div>{msg.message}</div>
		</div>
	);
};

const MessageList = ({ messages, selfId, onRead, onLoadHistory }) => {
	const endRef = useRef(null);
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);
	return (
		<div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
			<div style={{ textAlign: 'center', marginBottom: 8 }}>
				<button onClick={onLoadHistory} style={{ fontSize: 12, padding: '4px 8px' }}>
					Load history
				</button>
			</div>
			{messages.map((m) => (
				<Message key={m.id} msg={m} selfId={selfId} onRead={onRead} />
			))}
			<div ref={endRef} />
		</div>
	);
};

const MessageInput = ({ onSend, onTyping }) => {
	const [text, setText] = useState('');
	const typingTimeout = useRef(null);
	const handleChange = (e) => {
		setText(e.target.value);
		onTyping(true);
		clearTimeout(typingTimeout.current);
		typingTimeout.current = setTimeout(() => onTyping(false), 900);
	};
	const handleSend = () => {
		if (!text.trim()) return;
		onSend(text.trim());
		setText('');
		onTyping(false);
	};
	return (
		<div style={{ display: 'flex', gap: 8 }}>
			<input
				style={{ flex: 1, padding: 8 }}
				type="text"
				placeholder="Type a message..."
				value={text}
				onChange={handleChange}
				onKeyDown={(e) => {
					if (e.key === 'Enter') handleSend();
				}}
			/>
			<button onClick={handleSend} style={{ padding: '8px 12px' }}>
				Send
			</button>
		</div>
	);
};

const RoomsBar = ({ onJoin, onLeave, currentRoom, rooms }) => {
	const [room, setRoom] = useState('');
	return (
		<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
			<strong>Room:</strong>
			<span>{currentRoom}</span>
			<input
				style={{ marginLeft: 'auto', padding: 6 }}
				placeholder="room name"
				value={room}
				onChange={(e) => setRoom(e.target.value)}
			/>
			<button onClick={() => room && onJoin(room)}>Join</button>
			<button onClick={() => room && onLeave(room)}>Leave</button>
		</div>
	);
};

export default function App() {
	const {
		socket,
		isConnected,
		messages,
		users,
		typingUsers,
		connect,
		disconnect,
		sendMessage,
		sendPrivateMessage,
		setTyping
	} = useSocket();

	const [username, setUsername] = useState(null);
	const [currentRoom, setCurrentRoom] = useState('global');
	const [unread, setUnread] = useState(0);
	const selfId = socket?.id;

	// handle browser notification + unread
	useEffect(() => {
		if (!document.hasFocus()) {
			setUnread((u) => u + 1);
			if ('Notification' in window && Notification.permission === 'granted') {
				new Notification('New message', { body: 'You have a new message' });
			}
		}
	}, [messages.length]);
	useEffect(() => {
		const onFocus = () => setUnread(0);
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	}, []);

	// mark read receipt handling
	useEffect(() => {
		const onMessageRead = ({ messageId }) => {
			// mark local copy as read when someone read my sent message
			// in a real app, we would track per-user; here binary read shown for sender
		};
		socket.on('message_read', onMessageRead);
		return () => socket.off('message_read', onMessageRead);
	}, [socket]);

	const onLogin = (name) => {
		setUsername(name);
		connect(name);
	};

	const onSendGlobal = (text) => {
		sendMessage({ message: text, room: currentRoom }, (ack) => {
			// optional: handle delivery ack
		});
	};

	const onSendPrivate = (user) => {
		const text = window.prompt(`Private message to ${user.username}:`);
		if (text && text.trim()) {
			sendPrivateMessage(user.id, text.trim(), () => {});
		}
	};

	const joinRoom = (room) => {
		socket.emit('join_room', room);
		setCurrentRoom(room);
	};
	const leaveRoom = (room) => {
		socket.emit('leave_room', room);
		if (currentRoom === room) setCurrentRoom('global');
	};

	const messagesInRoom = useMemo(
		() => messages.filter((m) => m.system || m.isPrivate || (m.room || 'global') === currentRoom),
		[messages, currentRoom]
	);

	const loadHistory = async () => {
		try {
			const res = await fetch('/api/messages');
			const data = await res.json();
			// naive merge: ensure no duplicates
			const existingIds = new Set(messages.map((m) => m.id));
			const toAdd = data.filter((m) => !existingIds.has(m.id));
			toAdd.sort((a, b) => (a.id || 0) - (b.id || 0));
			toAdd.forEach((m) => {
				// push via synthetic set to reuse rendering
			});
		} catch (e) {
			console.error('Failed to load history', e);
		}
	};

	const markRead = (msg) => {
		if (msg.senderId !== selfId && !msg.system) {
			socket.emit('message_read', { messageId: msg.id });
		}
	};

	if (!username) {
		return (
			<div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
				<h2>Welcome to Socket.io Chat</h2>
				<UsernameForm onSubmit={onLogin} />
			</div>
		);
	}

	return (
		<div style={{ maxWidth: 960, margin: '20px auto', padding: 16, display: 'flex', gap: 16 }}>
			<UserList users={users} onPrivate={onSendPrivate} />
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
					<h2 style={{ margin: 0, flex: 1 }}>
						Chat {unread > 0 && <span style={{ fontSize: 14, color: '#b21' }}>({unread} new)</span>}
					</h2>
					<span style={{ color: isConnected ? '#2b8' : '#b21' }}>
						{isConnected ? 'Online' : 'Offline'}
					</span>
					<button onClick={() => disconnect()}>Disconnect</button>
				</div>
				<RoomsBar
					currentRoom={currentRoom}
					onJoin={joinRoom}
					onLeave={leaveRoom}
					rooms={['global']}
				/>
				<div style={{ minHeight: 420, border: '1px solid #ddd', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column' }}>
					<MessageList messages={messagesInRoom} selfId={selfId} onRead={markRead} onLoadHistory={loadHistory} />
					{typingUsers.length > 0 && (
						<div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
							{typingUsers.join(', ')} typing...
						</div>
					)}
					<MessageInput onSend={onSendGlobal} onTyping={setTyping} />
				</div>
			</div>
			<NotificationBell enabled />
		</div>
	);
}


