import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';

export const getSignup = (req, res) => {
    res.render('signup', { message: req.query.message || '' });
};

export const getSignin = (req, res) => {
    res.render('signin', { message: req.query.message || '' });
};

export const postSignup = async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    console.log('📝 Signup attempt:', { username });

    try {
        // Validation
        if (!username || !password || !confirmPassword) {
            console.log('❌ Missing fields');
            return res.render('signup', { message: 'Please fill in all fields.' });
        }

        if (password !== confirmPassword) {
            console.log('❌ Passwords do not match');
            return res.render('signup', { message: 'Passwords do not match.' });
        }

        if (password.length < 6) {
            console.log('❌ Password too short');
            return res.render('signup', { message: 'Password must be at least 6 characters long.' });
        }

        // Check if username exists
        console.log('🔍 Checking if username exists...');
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('❌ Database error checking username:', checkError);
            throw checkError;
        }

        if (existingUser) {
            console.log('❌ Username already exists');
            return res.render('signup', { message: 'Username already exists. Please choose another.' });
        }

        // Hash password
        console.log('🔒 Hashing password...');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        console.log('💾 Creating new user...');
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ 
                username: username, 
                password: hashedPassword 
            }])
            .select()
            .single();

        if (insertError) {
            console.error('❌ Error inserting user:', insertError);
            throw insertError;
        }

        console.log('✅ User created successfully:', newUser.id);
        
        // Set session
        req.session.user = { 
            id: newUser.id, 
            username: newUser.username 
        };

        console.log('✅ Redirecting to signin...');
        res.redirect('/signin?message=Account created successfully! Please sign in.');

    } catch (error) {
        console.error('❌ Signup error:', error);
        res.render('signup', { message: 'Error creating account. Please try again.' });
    }
};

export const postSignin = async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Signin attempt:', { username });

    try {
        // Validation
        if (!username || !password) {
            console.log('❌ Missing credentials');
            return res.render('signin', { message: 'Please enter both username and password.' });
        }

        // Find user
        console.log('🔍 Looking up user...');
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('id, username, password')
            .eq('username', username)
            .maybeSingle();

        if (fetchError) {
            console.error('❌ Database error:', fetchError);
            throw fetchError;
        }

        if (!user) {
            console.log('❌ User not found');
            return res.render('signin', { message: 'Invalid username or password.' });
        }

        // Verify password
        console.log('🔒 Verifying password...');
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            console.log('❌ Invalid password');
            return res.render('signin', { message: 'Invalid username or password.' });
        }

        // Set session
        req.session.user = { 
            id: user.id, 
            username: user.username 
        };

        console.log('✅ User signed in successfully');
        res.redirect('/');

    } catch (error) {
        console.error('❌ Signin error:', error);
        res.render('signin', { message: 'Error signing in. Please try again.' });
    }
};

export const logout = (req, res) => {
    console.log('👋 User logging out:', req.session.user?.username);
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Logout error:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
};