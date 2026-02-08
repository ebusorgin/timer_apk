-- Fix FKs: contact_requests, contacts, calls, chat_messages, push_subscriptions
-- должны ссылаться на users, а не subscribers

-- contact_requests (уже исправлено вручную)
-- ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_from_id_fkey;
-- ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_to_id_fkey;
-- ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_from_id_fkey FOREIGN KEY (from_id) REFERENCES users(id);
-- ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_to_id_fkey FOREIGN KEY (to_id) REFERENCES users(id);

-- contacts
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_owner_id_fkey;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_contact_id_fkey;
ALTER TABLE contacts ADD CONSTRAINT contacts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE;

-- calls
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_from_id_fkey;
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_to_id_fkey;
ALTER TABLE calls ADD CONSTRAINT calls_from_id_fkey FOREIGN KEY (from_id) REFERENCES users(id);
ALTER TABLE calls ADD CONSTRAINT calls_to_id_fkey FOREIGN KEY (to_id) REFERENCES users(id);

-- chat_messages
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_from_id_fkey;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_to_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_from_id_fkey FOREIGN KEY (from_id) REFERENCES users(id);
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_to_id_fkey FOREIGN KEY (to_id) REFERENCES users(id);

-- push_subscriptions
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_subscriber_id_fkey;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_subscriber_id_fkey FOREIGN KEY (subscriber_id) REFERENCES users(id) ON DELETE CASCADE;
