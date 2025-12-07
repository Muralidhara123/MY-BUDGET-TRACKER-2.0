import sqlite3
import datetime
import os
from datetime import timezone
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'super_secret_key_for_demo_only' # Change in production
CORS(app)

DB_NAME = 'budget.db'

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL
                )''')
    # Transactions table
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    type TEXT NOT NULL, 
                    amount REAL NOT NULL,
                    description TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )''')
    conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login_page'))

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return render_template('dashboard.html', username=session.get('username'))



@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Missing fields'}), 400
    
    hashed_password = generate_password_hash(password)
    
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, hashed_password))
        conn.commit()
        return jsonify({'success': True, 'message': 'User registered successfully'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 409
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    
    if user and check_password_hash(user['password'], password):
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({'success': True})
    else:
        return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/transactions', methods=['GET', 'POST'])
def transactions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    user_id = session['user_id']
    
    if request.method == 'POST':
        data = request.json
        t_type = data.get('type') # 'income' or 'expense'
        try:
            amount = float(data.get('amount'))
        except ValueError:
            return jsonify({'error': 'Invalid amount'}), 400
        description = data.get('description')
        
        # Store timestamp explicitly in UTC ISO format
        timestamp = datetime.datetime.now(timezone.utc).isoformat()
        
        conn.execute('INSERT INTO transactions (user_id, type, amount, description, timestamp) VALUES (?, ?, ?, ?, ?)',
                     (user_id, t_type, amount, description, timestamp))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
        
    else: # GET
        txs = conn.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC', (user_id,)).fetchall()
        
        # Calculate summary
        total_income = conn.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'income'", (user_id,)).fetchone()[0] or 0
        total_expense = conn.execute("SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'expense'", (user_id,)).fetchone()[0] or 0
        balance = total_income - total_expense
        
        transactions_list = []
        for tx in txs:
            transactions_list.append({
                'id': tx['id'],
                'type': tx['type'],
                'amount': tx['amount'],
                'description': tx['description'],
                'timestamp': tx['timestamp']
            })
            
        conn.close()
        return jsonify({
            'transactions': transactions_list,
            'summary': {
                'income': total_income,
                'expense': total_expense,
                'balance': balance
            }
        })

@app.route('/api/transactions/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM transactions WHERE id = ? AND user_id = ?', (id, session['user_id']))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/reset_data', methods=['POST'])
def reset_data():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db_connection()
    try:
        conn.execute('DELETE FROM transactions WHERE user_id = ?', (session['user_id'],))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
