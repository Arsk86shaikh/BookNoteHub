import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

console.log('Testing Supabase connection...');
console.log('URL:', process.env.SUPABASE_URL);

// Test insert
async function testInsert() {
    console.log('\n🧪 Testing insert...');
    
    const { data, error } = await supabase
        .from('users')
        .insert([{ 
            username: 'testuser_' + Date.now(), 
            password: 'hashedpassword123' 
        }])
        .select();

    if (error) {
        console.error('❌ Insert failed:', error);
    } else {
        console.log('✅ Insert successful:', data);
    }
}

// Test select
async function testSelect() {
    console.log('\n🧪 Testing select...');
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(5);

    if (error) {
        console.error('❌ Select failed:', error);
    } else {
        console.log('✅ Select successful:', data);
    }
}

async function runTests() {
    await testSelect();
    await testInsert();
    await testSelect();
}

runTests();